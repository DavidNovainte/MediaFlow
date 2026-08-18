const fs = require('fs');
const path = require('path');

/**
 * 递归对比并同步两个 JSON 对象的 key
 * @param {Object} source - 基准源对象 (en-US)
 * @param {Object} target - 待同步的目标语言包对象
 * @returns {boolean} 是否进行了修改
 */
function syncKeys(source, target) {
    let modified = false;
    for (const [key, value] of Object.entries(source)) {
        if (target[key] === undefined) {
            // 如果目标缺失该 key，则直接从源拷贝
            target[key] = JSON.parse(JSON.stringify(value));
            modified = true;
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            // 如果该 key 对应的是一个子对象，递归进行同步
            if (typeof target[key] !== 'object' || Array.isArray(target[key]) || target[key] === null) {
                target[key] = {};
                modified = true;
            }
            const childModified = syncKeys(value, target[key]);
            if (childModified) {
                modified = true;
            }
        }
    }
    return modified;
}

/**
 * 主执行函数
 */
function runSync() {
    const localesDir = path.resolve(__dirname, '../src/locales');
    const sourceLocale = 'en-US';
    const sourceDir = path.join(localesDir, sourceLocale);
    
    if (!fs.existsSync(sourceDir)) {
        console.error(`源语言包目录不存在: ${sourceDir}`);
        process.exit(1);
    }

    const jsonFiles = fs.readdirSync(sourceDir).filter(file => file.endsWith('.json'));
    const targetLocales = fs.readdirSync(localesDir).filter(name => {
        return name !== sourceLocale && fs.statSync(path.join(localesDir, name)).isDirectory();
    });

    console.log(`开始以 ${sourceLocale} 为基准同步，目标语言包列表: ${targetLocales.join(', ')}`);

    for (const targetLocale of targetLocales) {
        const targetDir = path.join(localesDir, targetLocale);
        for (const file of jsonFiles) {
            const sourceFilePath = path.join(sourceDir, file);
            const targetFilePath = path.join(targetDir, file);

            const sourceData = JSON.parse(fs.readFileSync(sourceFilePath, 'utf8'));
            let targetData = {};

            if (fs.existsSync(targetFilePath)) {
                try {
                    targetData = JSON.parse(fs.readFileSync(targetFilePath, 'utf8'));
                } catch (error) {
                    console.warn(`读取并解析文件失败: ${targetFilePath}, 将重新生成。`, error);
                }
            }

            const modified = syncKeys(sourceData, targetData);

            if (modified || !fs.existsSync(targetFilePath)) {
                fs.writeFileSync(targetFilePath, JSON.stringify(targetData, null, 2), 'utf8');
                console.log(`[同步] 已更新: ${targetLocale}/${file}`);
            }
        }
    }
    console.log('语言包 Key 自动同步更新完成！');
}

runSync();
