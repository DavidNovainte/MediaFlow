# MediaFlow 发布与安装指南

本文档旨在帮助开发者完成打包发布，并指导用户在未签名（Win）或已公证（Mac）环境下顺利安装。

## 1. 开发者打包指南

### 准备工作 (macOS 公证)
由于您已有 Apple 开发者账号，打包前请在您的 **打包机 (Mac)** 上设置以下环境变量：

```bash
# 您的 Apple ID
export APPLE_ID="your-email@example.com"
# 在 appleid.apple.com 生成的 App-Specific Password (不是登录密码)
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
# 您的 Team ID (在开发者后台查看)
export APPLE_TEAM_ID="XXXXXXXXXX"
```

### 执行打包
在终端运行：
```bash
# 下载全平台内核文件
node scripts/download-binaries.js

# 执行打包 (electron-builder 会自动读取上述变量进行公证)
npm run build:mac
npm run build:win
```

---

## 2. 用户安装避坑指南 (建议放在官网/仓库首页)

### Windows 用户 (未签名提示)
由于本软件暂未购买昂贵的 Windows 数字证书，安装时可能会触发 **SmartScreen 筛选器**：
1. 弹出蓝色警告窗：“Windows 已保护你的电脑”。
2. 点击文字 **“更多信息”**。
3. 点击右下角出现的 **“仍要运行”** 按钮即可开始安装。
> *注：MediaFlow 是开源透明的，您可以放心运行。*

### macOS 用户 (首次运行提示)
虽然应用已通过 Apple 公证，但由于是分发版而非 App Store 版，首次打开可能提示“无法验证开发者”：
1. 弹出提示：“无法打开‘MediaFlow’，因为 Apple 无法检查……”
2. 点击 **“取消”**。
3. 打开 **“系统设置” -> “隐私与安全性”**。
4. 下滑找到安全性部分，点击 **“仍要打开”**。
5. 输入开机密码确认即可。
> *后续运行将不再弹出此提示。*

---

## 3. 发布清单 CheckList
- [ ] 运行 `node scripts/download-binaries.js` 搜集内核。
- [ ] 确认 `package.json` 中的 `version` 已升级。
- [ ] 检查 `assets/icons/` 图标是否完整。
- [ ] Windows 执行 `build:win` 产出 `.exe`。
- [ ] macOS 执行 `build:mac` 产出已公证的 `.dmg`。
