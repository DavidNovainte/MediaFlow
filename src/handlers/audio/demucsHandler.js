const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

let app = { isPackaged: false };
try {
    ({ app } = require('electron'));
} catch (electronLoadError) {
    void electronLoadError;
}

let activeProcess = null;
let currentEventSender = null;
let cachedPython = null;

function getDemucsScriptPath() {
    if (app?.isPackaged) {
        return path.join(process.resourcesPath, 'app.asar.unpacked', 'services', 'python', 'demucs_compat_separate.py');
    }
    return path.resolve(__dirname, '../../../services/python/demucs_compat_separate.py');
}

function getDemucsSpawnEnv() {
    const env = { ...process.env };
    const isPackaged = !!app?.isPackaged;
    const binDir = isPackaged
        ? path.join(process.resourcesPath, 'bin')
        : path.resolve(__dirname, '../../../bin');

    if (fs.existsSync(binDir)) {
        const currentPath = env.PATH || '';
        const segments = currentPath.split(path.delimiter).filter(Boolean);
        if (!segments.includes(binDir)) {
            env.PATH = `${binDir}${path.delimiter}${currentPath}`;
        }
    }

    return env;
}

async function findPython(useCache = true) {
    if (useCache && cachedPython) {
        return cachedPython;
    }

    const isWindows = process.platform === 'win32';

    const checkCmd = (cmd, args) => {
        return new Promise((resolve) => {
            const proc = spawn(cmd, [...args, '--version'], { shell: true });
            let settled = false;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                resolve(result);
            };

            proc.on('close', (code) => finish(code === 0));
            proc.on('error', () => finish(false));
            setTimeout(() => {
                try {
                    proc.kill();
                } catch (error) {
                    void error;
                }
                finish(false);
            }, 2000);
        });
    };

    if (isWindows) {
        // Check local venv first (dev environment)
        const venvPython = path.join(__dirname, '..', '..', '..', '..', '.venv', 'Scripts', 'python.exe');
        if (fs.existsSync(venvPython) && await checkCmd(venvPython, [])) {
            cachedPython = { cmd: venvPython, args: [], version: 'venv' };
            return cachedPython;
        }

        const versions = ['3.11', '3.12', '3.10', '3.9', '3.8', '3.13', '3.14'];
        for (const ver of versions) {
            if (await checkCmd('py', [`-${ver}`])) {
                cachedPython = { cmd: 'py', args: [`-${ver}`], version: ver };
                return cachedPython;
            }
        }

        if (await checkCmd('python', [])) {
            cachedPython = { cmd: 'python', args: [], version: 'default' };
            return cachedPython;
        }

        cachedPython = { cmd: 'python', args: [], version: 'unknown' };
        return cachedPython;
    }

    cachedPython = { cmd: 'python3', args: [], version: 'unknown' };
    return cachedPython;
}

async function checkDemucsAvailable() {
    try {
        const python = await findPython();

        const checkPython = () => new Promise((resolve) => {
            const proc = spawn(python.cmd, [...python.args, '--version'], { shell: true });
            let out = '';
            proc.stdout.on('data', (d) => out += d.toString());
            proc.on('close', (code) => resolve({ status: code, stdout: out }));
            proc.on('error', () => resolve({ status: -1 }));
        });

        const pythonResult = await checkPython();
        if (pythonResult.status !== 0) {
            return { available: false, error: 'Python not found', pythonInstalled: false };
        }

        const checkModules = () => new Promise((resolve) => {
            const proc = spawn(python.cmd, [...python.args, '-c', 'import demucs; import soundfile; print(demucs.__version__)']);
            let out = '';
            let err = '';
            let settled = false;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                resolve(result);
            };

            proc.stdout.on('data', (d) => out += d.toString());
            proc.stderr.on('data', (d) => err += d.toString());
            proc.on('close', (code) => finish({ status: code, stdout: out, stderr: err }));
            proc.on('error', () => finish({ status: -1 }));
            setTimeout(() => {
                try {
                    proc.kill();
                } catch (error) {
                    void error;
                }
                finish({ status: -1, stderr: 'Timeout' });
            }, 30000);
        });

        const demucsCheck = await checkModules();
        if (demucsCheck.status !== 0) {
            const errDetail = (demucsCheck.stderr || demucsCheck.stdout || '').trim();
            return {
                available: false,
                error: `Check failed: ${errDetail.split('\n').pop()}`,
                details: errDetail,
                pythonInstalled: true,
                pythonVersion: python.version,
                demucsInstalled: false
            };
        }

        const version = demucsCheck.stdout?.trim() || 'unknown';
        return {
            available: true,
            version,
            pythonInstalled: true,
            pythonVersion: python.version,
            demucsInstalled: true
        };
    } catch (error) {
        return { available: false, error: error.message };
    }
}

async function installDemucs(event) {
    const python = await findPython();
    return new Promise((resolve) => {
        try {
            event.sender.send('demucs:installProgress', { status: `Using Python ${python.version}...` });

            const steps = [
                [...python.args, '-m', 'pip', 'install', '--upgrade', 'pip'],
                [...python.args, '-m', 'pip', 'uninstall', '-y', 'torchcodec'],
                [...python.args, '-m', 'pip', 'install', 'soundfile', 'demucs']
            ];

            let currentStep = 0;

            const runStep = () => {
                if (currentStep >= steps.length) {
                    resolve({ success: true });
                    return;
                }

                const args = steps[currentStep];
                event.sender.send('demucs:installProgress', {
                    status: `Step ${currentStep + 1}/${steps.length}: ${python.cmd} ${args.join(' ')}`
                });

                const proc = spawn(python.cmd, args, { env: { ...process.env } });
                activeProcess = proc;
                let errorOutput = '';

                proc.stdout.on('data', (data) => {
                    console.log('[demucs install]', data.toString());
                });

                proc.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                    console.log('[demucs install stderr]', data.toString());
                });

                proc.on('close', (code) => {
                    activeProcess = null;
                    if (code === 0) {
                        currentStep++;
                        runStep();
                    } else {
                        resolve({ success: false, error: errorOutput || `Step ${currentStep + 1} failed with code ${code}` });
                    }
                });

                proc.on('error', (err) => {
                    activeProcess = null;
                    resolve({ success: false, error: err.message });
                });
            };

            runStep();
        } catch (error) {
            resolve({ success: false, error: error.message });
        }
    });
}

async function separateAudio(event, options) {
    let { input, output, twoStems = true } = options;

    if (!output) {
        output = path.join(os.tmpdir(), 'mediaflow_demucs', Date.now().toString());
    }

    if (!fs.existsSync(output)) {
        fs.mkdirSync(output, { recursive: true });
    }

    currentEventSender = event.sender;
    const python = await findPython();
    const scriptPath = getDemucsScriptPath();

    return new Promise((resolve) => {
        try {
            const args = [
                ...python.args,
                '-u',
                scriptPath,
                '-o', output
            ];

            if (twoStems) {
                args.push('--two-stems', 'vocals');
            }

            const threads = os.cpus().length || 4;
            args.push('-j', threads.toString());
            args.push(input);

            const proc = spawn(python.cmd, args, { env: getDemucsSpawnEnv() });
            activeProcess = proc;
            let errorOutput = '';
            let currentProgress = 0;
            let fallbackTimer = null;

            const emitProgress = (progress, status = 'separating') => {
                const nextProgress = Math.max(currentProgress, Math.min(100, progress));
                if (nextProgress === currentProgress && status === 'separating') return;
                currentProgress = nextProgress;
                event.sender.send('demucs:progress', {
                    progress: currentProgress,
                    status
                });
            };

            const parseProgressChunk = (chunk) => {
                const matches = [...chunk.matchAll(/(\d{1,3})%/g)];
                if (!matches.length) return;
                const latest = parseInt(matches[matches.length - 1][1], 10);
                if (!Number.isNaN(latest)) {
                    emitProgress(latest, 'separating');
                }
            };

            fallbackTimer = setInterval(() => {
                if (currentProgress < 90) {
                    emitProgress(currentProgress + 3, 'separating');
                }
            }, 1200);

            proc.stderr.on('data', (data) => {
                const str = data.toString();
                errorOutput += str;
                console.log('[demucs stderr]', str);
                parseProgressChunk(str);
            });

            proc.stdout.on('data', (data) => {
                const str = data.toString();
                console.log('[demucs stdout]', str);
                parseProgressChunk(str);
            });

            proc.on('close', (code) => {
                activeProcess = null;
                currentEventSender = null;
                if (fallbackTimer) {
                    clearInterval(fallbackTimer);
                    fallbackTimer = null;
                }

                if (code === 0) {
                    emitProgress(100, 'Done!');

                    const findFiles = (dir) => {
                        let results = {};
                        if (!fs.existsSync(dir)) return results;

                        const list = fs.readdirSync(dir);
                        list.forEach((file) => {
                            const filePath = path.join(dir, file);
                            const stat = fs.statSync(filePath);
                            if (stat && stat.isDirectory()) {
                                Object.assign(results, findFiles(filePath));
                            } else if (file.endsWith('.wav') || file.endsWith('.mp3')) {
                                results[file] = filePath;
                            }
                        });
                        return results;
                    };

                    const outputFiles = findFiles(output);
                    const expectedDir = path.join(output, 'htdemucs');
                    const finalFiles = fs.existsSync(expectedDir) ? findFiles(expectedDir) : outputFiles;

                    resolve({ success: true, output, files: finalFiles });
                } else if (code === null) {
                    resolve({ success: false, cancelled: true });
                } else {
                    resolve({
                        success: false,
                        error: `Demucs exited with code ${code}. Error: ${errorOutput.slice(-200)}`
                    });
                }
            });

            proc.on('error', (err) => {
                activeProcess = null;
                currentEventSender = null;
                if (fallbackTimer) {
                    clearInterval(fallbackTimer);
                    fallbackTimer = null;
                }
                resolve({ success: false, error: err.message });
            });
        } catch (error) {
            resolve({ success: false, error: error.message });
        }
    });
}

function cancelSeparation() {
    if (!activeProcess) return false;

    try {
        activeProcess.kill('SIGKILL');
        activeProcess = null;
        if (currentEventSender) {
            currentEventSender.send('demucs:progress', { progress: 0, status: 'Cancelled' });
        }
        return true;
    } catch (error) {
        console.error('[demucsHandler] Cancel failed:', error);
        return false;
    }
}

async function saveDemucsFiles(event, { files, targetDir }) {
    try {
        if (!files || !targetDir) {
            return { success: false, error: 'Missing files or target directory' };
        }

        const savedFiles = [];
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        for (const [, srcPath] of Object.entries(files)) {
            if (fs.existsSync(srcPath)) {
                const destPath = path.join(targetDir, path.basename(srcPath));
                fs.copyFileSync(srcPath, destPath);
                savedFiles.push(destPath);
            }
        }

        return { success: true, savedFiles };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    checkDemucsAvailable,
    installDemucs,
    separateAudio,
    cancelSeparation,
    saveDemucsFiles,
    findPython
};
