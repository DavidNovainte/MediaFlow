/**
 * 图标生成脚本
 * 从 PNG 生成 Windows (.ico) 和 macOS (.icns) 格式
 */

const path = require('path');
const fs = require('fs');

const inputPath = path.join(__dirname, '../assets/icons/icon.png');
const iconsDir = path.join(__dirname, '../assets/icons');

console.log('🎨 开始生成应用图标...');
console.log(`📁 输入文件: ${inputPath}`);
console.log(`📂 输出目录: ${iconsDir}\n`);

// 确保输出目录存在
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

async function generateIcons() {
    try {
        // 读取 PNG 文件
        const pngBuffer = fs.readFileSync(inputPath);

        // 1. 生成 Windows .ico 文件
        console.log('⏳ 正在生成 Windows 图标 (.ico)...');
        const pngToIco = (await import('png-to-ico')).default;
        const icoBuffer = await pngToIco(pngBuffer);
        const icoPath = path.join(iconsDir, 'icon.ico');
        fs.writeFileSync(icoPath, icoBuffer);
        console.log('✅ Windows 图标生成成功: icon.ico');

        // 2. 生成 macOS .icns 文件
        console.log('⏳ 正在生成 macOS 图标 (.icns)...');
        const png2icons = require('png2icons');
        const icnsBuffer = await png2icons.createICNS(pngBuffer, png2icons.BICUBIC, 0);
        const icnsPath = path.join(iconsDir, 'icon.icns');
        fs.writeFileSync(icnsPath, icnsBuffer);
        console.log('✅ macOS 图标生成成功: icon.icns');

        console.log('\n🎉 所有图标生成完成!');
        console.log('  📦 icon.ico  - Windows 安装包图标');
        console.log('  🍎 icon.icns - macOS 应用图标');
        console.log('  🖼️ icon.png  - 通用图标 (已存在)\n');
    } catch (error) {
        console.error('❌ 图标生成失败:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

generateIcons();
