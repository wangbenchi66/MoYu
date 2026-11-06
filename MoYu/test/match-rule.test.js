import test from 'node:test'
import assert from 'node:assert/strict'
import { matchesRule } from '../src/rules/matchRule.js'

test('hostname 精确匹配与子域匹配', () => {
    assert.equal(matchesRule({ pattern: 'example.com' }, 'https://example.com/a'), true)
    assert.equal(matchesRule({ pattern: 'example.com' }, 'https://sub.example.com/a'), true)
    assert.equal(matchesRule({ pattern: 'example.com' }, 'https://notexample.com/a'), false)
})

test('hostname 通配符', () => {
    assert.equal(matchesRule({ pattern: '*.example.com' }, 'https://a.example.com/x'), true)
    assert.equal(matchesRule({ pattern: '*.example.com' }, 'https://example.com/x'), false)
})

test('url 子串匹配', () => {
    assert.equal(matchesRule({ pattern: '/article/', matchType: 'url' }, 'https://example.com/article/1'), true)
    assert.equal(matchesRule({ pattern: '/article/', matchType: 'url' }, 'https://example.com/home'), false)
})

test('regex 匹配（含数组里的 /正则/ 写法）', () => {
    assert.equal(matchesRule({ pattern: '^https://example\\.com/\\d+', matchType: 'regex' }, 'https://example.com/123'), true)
    assert.equal(matchesRule({ pattern: ['/example\\.com/'] }, 'https://example.com/a'), true)
})

test('危险正则被拒绝（防 ReDoS）', () => {
    const rule = { pattern: '(a+)+$', matchType: 'regex' }
    const url = 'https://example.com/' + 'a'.repeat(2000) + '!'
    const started = Date.now()
    assert.equal(matchesRule(rule, url), false)
    assert.ok(Date.now() - started < 500, 'should not hang on nested quantifiers')
})

test('超长 pattern 不参与编译', () => {
    const rule = { pattern: 'a'.repeat(400), matchType: 'regex' }
    assert.equal(matchesRule(rule, 'https://example.com/aaa'), false)
})

test('自定义 match 函数优先', () => {
    assert.equal(matchesRule({ match: (u) => u.includes('foo') }, 'https://x/foo'), true)
    assert.equal(matchesRule({ match: () => { throw new Error('boom') } }, 'https://x/foo'), false)
})
