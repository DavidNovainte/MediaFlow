/**
 * MediaFlow - Mobile Flow Server Wrapper
 * 已重构为模块化架构，核心逻辑位于 ./mobile/ 目录下
 */

const mobileFlowServer = require('./mobile/MobileFlowServer');

// 导出单例实例，保持向后兼容
module.exports = mobileFlowServer;
