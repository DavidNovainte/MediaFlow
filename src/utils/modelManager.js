/**
 * ModelManager - AI 模型下载管理器
 * 管理 DeepFilterNet 等本地 AI 模型的下载、安装、删除
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { app } = require('electron');

// 模型存储基础路径
const getModelsDir = () => {
    const appData = app.getPath('userData');
    return path.join(appData, 'models');
};

// 确保模型目录存在
const ensureModelsDir = () => {
    const dir = getModelsDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
};

/**
 * 健壮的删除功能 (修复 Windows 下的 ENOTEMPTY/EBUSY 锁定问题)
 */
function robustDelete(dirPath) {
    if (!fs.existsSync(dirPath)) return true;

    try {
        // 尝试标准递归删除
        fs.rmSync(dirPath, { recursive: true, force: true });
        return true;
    } catch (err) {
        if (process.platform === 'win32' && (err.code === 'ENOTEMPTY' || err.code === 'EBUSY' || err.code === 'EPERM')) {
            console.warn(`[ModelManager] Standard delete failed (${err.code}), attempting rename-then-delete trick for:`, dirPath);
            try {
                // Windows 经典技巧：先重命名到一个随机目录名，再尝试异步删除
                const tempDir = `${dirPath}_to_be_deleted_${Date.now()}`;
                fs.renameSync(dirPath, tempDir);
                // 对 tempDir 进行最终清理 (延时执行，防止因为重命名瞬间的延迟导致立刻删除也失败)
                setTimeout(() => {
                    try {
                        if (fs.existsSync(tempDir)) {
                            fs.rmSync(tempDir, { recursive: true, force: true });
                        }
                    } catch (cleanupError) {
                        void cleanupError;
                    }
                }, 2000);
                return true;
            } catch (renameErr) {
                console.error('[ModelManager] Rename-delete trick also failed:', renameErr);
                throw err;
            }
        }
        throw err;
    }
}

// 可用模型配置
const AVAILABLE_MODELS = {
    deepfilter: {
        name: 'DeepFilterNet',
        description: 'common.modelManager.deepfilterDesc',
        version: '0.5.6',
        size: '50MB',
        platform: {
            win32: {
                url: 'https://github.com/Rikorose/DeepFilterNet/releases/download/v0.5.6/deep-filter-0.5.6-x86_64-pc-windows-msvc.exe',
                executable: 'deep-filter.exe'
            },
            darwin: {
                url: 'https://github.com/Rikorose/DeepFilterNet/releases/download/v0.5.6/deep-filter-0.5.6-x86_64-apple-darwin.tar.gz',
                executable: 'deep-filter'
            },
            linux: {
                url: 'https://github.com/Rikorose/DeepFilterNet/releases/download/v0.5.6/deep-filter-0.5.6-x86_64-unknown-linux-musl.tar.gz',
                executable: 'deep-filter'
            }
        }
    }
};

/**
 * 检查模型是否已安装
 */
function isModelInstalled(modelId) {
    const model = AVAILABLE_MODELS[modelId];
    if (!model) return false;

    const platform = process.platform;
    const platformConfig = model.platform[platform];
    if (!platformConfig) return false;

    const execPath = path.join(getModelsDir(), modelId, platformConfig.executable);
    return fs.existsSync(execPath);
}

/**
 * 获取模型可执行文件路径
 */
function getModelExecutable(modelId) {
    const model = AVAILABLE_MODELS[modelId];
    if (!model) return null;

    const platform = process.platform;
    const platformConfig = model.platform[platform];
    if (!platformConfig) return null;

    return path.join(getModelsDir(), modelId, platformConfig.executable);
}

/**
 * 获取所有模型状态
 */
function getModelsStatus() {
    const result = {};
    for (const [id, model] of Object.entries(AVAILABLE_MODELS)) {
        result[id] = {
            id,
            name: model.name,
            description: model.description,
            version: model.version,
            size: model.size,
            installed: isModelInstalled(id),
            supported: !!model.platform[process.platform]
        };
    }
    return result;
}

/**
 * 下载模型
 * @param {string} modelId 
 * @param {function} onProgress - (percent, status) => void
 */
async function downloadModel(modelId, onProgress) {
    const model = AVAILABLE_MODELS[modelId];
    if (!model) {
        throw new Error(`Unknown model: ${modelId}`);
    }

    const platform = process.platform;
    const platformConfig = model.platform[platform];
    if (!platformConfig) {
        throw new Error(`Model ${modelId} is not supported on ${platform}`);
    }

    ensureModelsDir();
    const modelDir = path.join(getModelsDir(), modelId);

    // 清理旧版本 (使用健壮删除)
    robustDelete(modelDir);
    fs.mkdirSync(modelDir, { recursive: true });

    const url = platformConfig.url;
    const isZip = url.endsWith('.zip');
    const isTar = url.endsWith('.tar.gz');
    const isExe = url.endsWith('.exe');

    const tempFile = path.join(modelDir, isZip ? 'download.zip' : (isTar ? 'download.tar.gz' : 'download_raw'));

    onProgress?.(0, 'common.modelManager.installing');

    // 下载文件
    await downloadFile(url, tempFile, (percent) => {
        onProgress?.(Math.floor(percent * 0.8), 'common.modelManager.installing');
    });

    if (isExe) {
        onProgress?.(90, 'common.modelManager.deploying');
        // 如果是 .exe，直接重命名为目标可执行文件名
        const targetPath = path.join(modelDir, platformConfig.executable);
        if (tempFile !== targetPath) {
            if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
            fs.renameSync(tempFile, targetPath);
        }
    } else {
        onProgress?.(80, 'common.modelManager.extracting');
        // 解压
        if (isZip) {
            await extractZip(tempFile, modelDir);
        } else {
            await extractTarGz(tempFile, modelDir);
        }

        // 清理临时文件
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
    }

    onProgress?.(100, 'common.modelManager.done');

    return {
        success: true,
        executable: getModelExecutable(modelId)
    };
}

/**
 * 删除模型
 */
function deleteModel(modelId) {
    const modelDir = path.join(getModelsDir(), modelId);
    try {
        return robustDelete(modelDir);
    } catch (e) {
        console.error(`[ModelManager] Failed to delete model ${modelId}:`, e);
        return false;
    }
}

/**
 * 下载文件（支持重定向）
 */
function downloadFile(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);

        const request = (currentUrl) => {
            https.get(currentUrl, (response) => {
                // 处理重定向
                if (response.statusCode === 301 || response.statusCode === 302) {
                    const redirectUrl = response.headers.location;
                    request(redirectUrl);
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`Download failed: ${response.statusCode}`));
                    return;
                }

                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloaded = 0;

                response.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (totalSize) {
                        onProgress?.(downloaded / totalSize);
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlink(dest, () => { });
                reject(err);
            });
        };

        request(url);
    });
}

/**
 * 解压 ZIP 文件
 */
async function extractZip(zipPath, destDir) {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(destDir, true);
}

/**
 * 解压 tar.gz 文件
 */
async function extractTarGz(tarPath, destDir) {
    const tar = require('tar');
    await tar.x({
        file: tarPath,
        cwd: destDir
    });
}

module.exports = {
    getModelsDir,
    getModelsStatus,
    isModelInstalled,
    getModelExecutable,
    downloadModel,
    deleteModel,
    AVAILABLE_MODELS
};
