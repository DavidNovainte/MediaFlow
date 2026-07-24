const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');

let cachedHWID = null;

/**
 * 异步执行命令并获取输出
 */
function execAsync(command) {
    return new Promise((resolve) => {
        exec(command, { encoding: 'utf8', windowsHide: true }, (error, stdout) => {
            if (error) {
                resolve('');
                return;
            }
            resolve(stdout || '');
        });
    });
}

/**
 * 获取硬件指纹因子 (异步)
 */
async function getHardwareFactors() {
    const factors = {
        cpu: 'UNKNOWN_CPU',
        baseboard: 'UNKNOWN_BOARD',
        disk: 'UNKNOWN_DISK'
    };

    if (process.platform === 'win32') {
        try {
            // 使用 wmic 获取
            const [cpuInfo, boardInfo, diskInfo] = await Promise.all([
                execAsync('wmic cpu get processorid /value'),
                execAsync('wmic baseboard get serialnumber /value'),
                execAsync('wmic diskdrive where "Index=0" get serialnumber /value')
            ]);

            factors.cpu = cpuInfo.split('=')[1]?.trim() || 'UNKNOWN_CPU';
            factors.baseboard = boardInfo.split('=')[1]?.trim() || 'UNKNOWN_BOARD';
            factors.disk = diskInfo.split('=')[1]?.trim() || 'UNKNOWN_DISK';

            // 如果全是 UNKNOWN，尝试 powershell
            if (factors.cpu === 'UNKNOWN_CPU' && factors.baseboard === 'UNKNOWN_BOARD') {
                const [psCpu, psBoard] = await Promise.all([
                    execAsync('powershell -Command "Get-CimInstance Win32_Processor | Select-Object -ExpandProperty ProcessorId"'),
                    execAsync('powershell -Command "Get-CimInstance Win32_BaseBoard | Select-Object -ExpandProperty SerialNumber"')
                ]);
                if (psCpu) factors.cpu = psCpu.trim();
                if (psBoard) factors.baseboard = psBoard.trim();
            }
        } catch (e) {
            console.error('[HWID] Failed to get hardware factors:', e);
        }
    } else {
        factors.cpu = os.cpus()[0]?.model || 'N/A';
        factors.baseboard = os.hostname();
    }

    return factors;
}

/**
 * 获取机器唯一标识码 (HWID) - 异步并带有缓存
 */
async function getHWID() {
    if (cachedHWID) return cachedHWID;

    const factors = await getHardwareFactors();
    const data = [
        factors.cpu,
        factors.baseboard,
        factors.disk
    ].join('|');

    cachedHWID = crypto.createHash('sha256').update(data).digest('hex');
    return cachedHWID;
}

/**
 * 容灾对比逻辑
 */
async function verifyFactors(storedFactors) {
    if (!storedFactors) return false;
    const current = await getHardwareFactors();
    let matches = 0;

    if (current.cpu === storedFactors.cpu) matches++;
    if (current.baseboard === storedFactors.baseboard) matches++;
    if (current.disk === storedFactors.disk) matches++;

    return matches >= 2;
}

module.exports = {
    getHWID,
    getHardwareFactors,
    verifyFactors
};
