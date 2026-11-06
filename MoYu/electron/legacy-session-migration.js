/**
 * 旧 defaultSession → 命名分区 的一次性迁移。
 *
 * v0.0.14 之前，所有标签页都跑在 `defaultSession` 里，cookie / localStorage /
 * IndexedDB 等登录态直接存在 `userData` 根目录。切到命名分区（`persist:moyu-web`）
 * 之后如果不迁移，用户会在所有网站被登出。
 *
 * 做法：首次启动、且分区目录还没有数据时，把 session 相关的存储目录整份**复制**
 * 过去（不复制 Cache / GPUCache 这类可重建的缓存）。复制而不是移动：
 * 如果以后要回退分区方案，旧数据还在，不会丢。
 */
import fs from 'node:fs'
import path from 'node:path'

/**
 * 需要迁移的 session 数据目录（Chromium 在 userData 根目录下的布局）。
 * 刻意不包含：Cache / Code Cache / GPUCache / Dawn* / Shader*（可重建）、
 * Preferences / Local State（属于整个 user-data-dir，不随分区走）。
 */
export const LEGACY_SESSION_ITEMS = [
    'Network',            // Cookies、Trust Tokens 等
    'Local Storage',
    'Session Storage',
    'IndexedDB',
    'WebStorage',
    'Service Worker',
    'DIPS',
    'Shared Dictionary',
    'blob_storage',
]

const MARKER_NAME = 'migration-v1.done'

/**
 * 把旧的 defaultSession 数据复制进命名分区。
 *
 * 参数:
 *   userData  - Electron 的 userData 目录
 *   partition - 分区名（不含 `persist:` 前缀，例如 'moyu-web'）
 * 返回: { migrated, reason?, items?, copied? }
 */
export function migrateLegacySessionToPartition({ userData, partition }) {
    const result = { migrated: false }
    try {
        if (!userData || !partition) {
            return { migrated: false, reason: 'missing userData or partition' }
        }

        const partitionDir = path.join(userData, 'Partitions', partition)
        const markerPath = path.join(partitionDir, MARKER_NAME)

        if (fs.existsSync(markerPath)) {
            return { migrated: false, reason: 'already migrated' }
        }

        // 分区已经被用过（例如先升级、后回滚、再升级）：不覆盖现有数据
        if (fs.existsSync(partitionDir)) {
            const existing = fs.readdirSync(partitionDir).filter((name) => name !== MARKER_NAME)
            if (existing.length > 0) {
                return { migrated: false, reason: 'partition already has data' }
            }
        }

        const sources = LEGACY_SESSION_ITEMS.filter((name) => {
            try { return fs.existsSync(path.join(userData, name)) } catch (e) { return false }
        })
        if (sources.length === 0) {
            return { migrated: false, reason: 'no legacy session data' }
        }

        fs.mkdirSync(partitionDir, { recursive: true })

        let copied = 0
        for (const name of sources) {
            try {
                fs.cpSync(path.join(userData, name), path.join(partitionDir, name), {
                    recursive: true,
                    force: false,
                    errorOnExist: false,
                })
                copied++
            } catch (e) {
                console.warn('[migrate] copy failed:', name, e?.message || e)
            }
        }

        // 只要复制成功过哪怕一项就写标记，避免下次启动反复复制；
        // 失败项在日志里，用户可以手动处理（大不了重新登录对应站点）。
        try {
            fs.writeFileSync(markerPath, JSON.stringify({
                at: new Date().toISOString(),
                items: sources,
                copied,
            }, null, 2), 'utf-8')
        } catch (e) {
            console.warn('[migrate] write marker failed:', e?.message || e)
        }

        result.migrated = copied > 0
        result.items = sources
        result.copied = copied
        return result
    } catch (e) {
        console.warn('[migrate] legacy session migration failed:', e?.message || e)
        return { migrated: false, reason: String(e?.message || e) }
    }
}
