/**
 * AssetDownloader.js - 资源下载器
 * 负责从远程 URL 下载引擎二进制文件并解压到 bin 目录
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { getBinaryPath } = require('../../utils/binaries');

class AssetDownloader {
    constructor() {
        // 使用 getBinaryPath('') 技巧获取 bin 目录
        const dummyPath = getBinaryPath('dummy');
        this.binDir = path.dirname(dummyPath);
    }

    /**
     * 下载资源
     * @param {string} url 下载地址
     * @param {string} engineId 引擎 ID
     * @param {Function} onProgress 进度回调 (percent)
     */
    async download(url, engineId, onProgress) {
        if (!url) throw new Error('Download URL is empty');

        const tempZip = path.join(os.tmpdir(), `mf_engine_${engineId}_${Date.now()}.zip`);
        const writer = fs.createWriteStream(tempZip);

        try {
            console.log(`[AssetDownloader] Downloading ${url} to ${tempZip}`);

            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream'
            });

            const totalLength = response.headers['content-length'];
            let downloadedLength = 0;

            response.data.on('data', (chunk) => {
                downloadedLength += chunk.length;
                if (onProgress && totalLength) {
                    const percent = (downloadedLength / totalLength) * 100;
                    onProgress(percent);
                }
            });

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', async () => {
                    try {
                        console.log('[AssetDownloader] Download finished, extracting...');
                        await this.extract(tempZip, this.binDir);
                        // 清理临时文件
                        fs.unlinkSync(tempZip);
                        resolve({ success: true });
                    } catch (err) {
                        reject(err);
                    }
                });
                writer.on('error', reject);
            });

        } catch (error) {
            if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
            throw error;
        }
    }

    /**
     * 解压资源 (Windows 下使用 PowerShell 以避免引入额外依赖)
     * @param {string} zipPath zip 文件路径
     * @param {string} destPath 目标路径
     */
    async extract(zipPath, destPath) {
        return new Promise((resolve, reject) => {
            // Windows PowerShell Expand-Archive 命令
            const cmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destPath}' -Force"`;

            exec(cmd, (error) => {
                if (error) {
                    console.error('[AssetDownloader] Extract error:', error);
                    return reject(new Error('Extract failed. Try unpacking the package manually.'));
                }
                resolve();
            });
        });
    }
}

module.exports = new AssetDownloader();
