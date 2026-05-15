// useDeviceReport.js — 匿名设备信息上报（需用户已同意隐私协议）
import http from '../http/index.js';

function parseOsInfo() {
  const ua = navigator.userAgent || '';
  const win = ua.match(/Windows NT ([\d.]+)/);
  if (win) {
    const verMap = { '10.0': 'Windows 10/11', '6.3': 'Windows 8.1', '6.1': 'Windows 7' };
    return verMap[win[1]] || `Windows NT ${win[1]}`;
  }
  const mac = ua.match(/Mac OS X ([\d_]+)/);
  if (mac) return `macOS ${mac[1].replace(/_/g, '.')}`;
  return ua.slice(0, 80);
}

// 上报设备信息，仅在用户已同意时执行，失败静默忽略
export async function reportDevice() {
  if (!localStorage.getItem('moyu-privacy-consent')) return;
  try {
    const desktopApi = typeof window !== 'undefined' ? window.desktop : null;
    // 设备 ID 从主进程文件读取，不随浏览器缓存清理而丢失
    const [deviceId, updateInfo] = await Promise.all([
      desktopApi?.getDeviceId?.() ?? '',
      desktopApi?.checkForUpdate?.() ?? {},
    ]);
    await http.post('/api/MoYu/ReportDevice', {
      deviceId,
      platform: updateInfo.platform || (desktopApi?.platform === 'darwin' ? 'mac' : 'win'),
      appVersion: updateInfo.currentVersion || '',
      osInfo: parseOsInfo(),
    });
  } catch (_) {}
}
