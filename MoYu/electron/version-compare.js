/**
 * 版本号比较（供更新检查与单元测试共用）。
 * 支持 `1.2.3`、`v1.2.3`、`1.2.3-beta.1` 这类格式。
 * 返回 >0 表示 a 更新，<0 表示 a 更旧，0 表示相同。
 */
export function compareVersions(a, b) {
    const parse = (v) => {
        const raw = String(v || '').replace(/^v/i, '').trim()
        const [core, pre = ''] = raw.split('-', 2)
        const nums = core.split('.').map((part) => {
            const m = /^\d+/.exec(part)
            return m ? Number(m[0]) : 0
        })
        while (nums.length < 3) nums.push(0)
        return { nums, pre }
    }
    const A = parse(a)
    const B = parse(b)
    for (let i = 0; i < 3; i++) {
        if (A.nums[i] !== B.nums[i]) return A.nums[i] > B.nums[i] ? 1 : -1
    }
    if (A.pre === B.pre) return 0
    if (!A.pre) return 1          // 正式版比预发布版新
    if (!B.pre) return -1
    return A.pre > B.pre ? 1 : -1
}

export default compareVersions
