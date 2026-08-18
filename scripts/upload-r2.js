const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const fs = require("fs");
const path = require("path");
const { loadR2Config } = require("./load-r2-config");
const R2_CONFIG = loadR2Config();

/**
 * Cloudflare R2 Upload Script for MediaFlow
 * 支持 Windows (.exe) 和 macOS (.dmg, .zip) 构建文件上传
 */

const s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_CONFIG.accessKeyId,
        secretAccessKey: R2_CONFIG.secretAccessKey,
    },
});

async function uploadFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`❌ 文件不存在: ${filePath}`);
        return;
    }

    const fileName = path.basename(filePath);
    const fileStream = fs.createReadStream(filePath);
    const fileSize = fs.statSync(filePath).size;

    console.log(`🚀 开始上传: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`📦 目标存储桶: ${R2_CONFIG.bucket}`);

    try {
        const parallelUploads3 = new Upload({
            client: s3Client,
            params: {
                Bucket: R2_CONFIG.bucket,
                Key: `${R2_CONFIG.downloadPrefix}/${fileName}`,
                Body: fileStream,
                ContentType: "application/octet-stream",
            },
            queueSize: 4,
            partSize: 1024 * 1024 * 5,
            leavePartsOnError: false,
        });

        parallelUploads3.on("httpUploadProgress", (progress) => {
            const percentage = ((progress.loaded / fileSize) * 100).toFixed(2);
            process.stdout.write(`\r[进度] 上传中: ${percentage}% ... `);
        });

        await parallelUploads3.done();

        console.log(`\n✅ 上传成功!`);
        console.log(`🔗 下载链接: https://${R2_CONFIG.customDomain}/${R2_CONFIG.downloadPrefix}/${fileName}\n`);

    } catch (err) {
        console.error("\n❌ 上传失败:", err.message);
    }
}

async function main() {
    // 如果命令行传了参数，直接上传指定文件
    if (process.argv[2]) {
        await uploadFile(process.argv[2]);
        return;
    }

    // 自动检测 dist 目录
    const distPath = path.join(__dirname, "../dist");
    if (!fs.existsSync(distPath)) {
        console.error("❌ 未找到 dist 目录，请先运行打包命令 (如 npm run build:mac 或 npm run build:win)。");
        return;
    }

    // 检测支持的文件格式 (.exe, .dmg, .zip)
    const supportedExtensions = [".exe", ".dmg", ".zip"];
    const files = fs.readdirSync(distPath)
        .filter(f => supportedExtensions.some(ext => f.endsWith(ext)))
        .map(f => ({
            name: f,
            path: path.join(distPath, f),
            mtime: fs.statSync(path.join(distPath, f)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) {
        console.log("❓ 未在 dist 目录找到支持的构建文件 (.exe, .dmg, .zip)。");
        return;
    }

    // 默认上传最新的一个文件（或根据后缀分组上传最新的）
    const platforms = { win: ".exe", mac: [".dmg", ".zip"] };
    const toUpload = [];

    // 寻找最新的 Windows 构建
    const latestWin = files.find(f => f.name.endsWith(platforms.win));
    if (latestWin) toUpload.push(latestWin);

    // 寻找最新的 Mac 构建
    const latestMac = files.find(f => platforms.mac.some(ext => f.name.endsWith(ext)));
    if (latestMac) toUpload.push(latestMac);

    console.log(`✨ 自动检测到以下最新构建:`);
    toUpload.forEach(f => console.log(`   - ${f.name}`));
    console.log("");

    for (const file of toUpload) {
        await uploadFile(file.path);
    }
}

main().catch(err => console.error("运行时错误:", err));
