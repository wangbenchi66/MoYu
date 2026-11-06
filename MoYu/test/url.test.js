import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeUrl } from '../src/shared/normalize-url.js'

test('普通域名补 https', () => {
    assert.equal(normalizeUrl('example.com'), 'https://example.com')
    assert.equal(normalizeUrl('www.example.com/a?b=1'), 'https://www.example.com/a?b=1')
})

test('保留 http/https 原样', () => {
    assert.equal(normalizeUrl('http://example.com'), 'http://example.com')
    assert.equal(normalizeUrl('https://example.com/x'), 'https://example.com/x')
})

test('IP 地址补 http', () => {
    assert.equal(normalizeUrl('127.0.0.1:8080'), 'http://127.0.0.1:8080')
})

test('空输入与 about:blank', () => {
    assert.equal(normalizeUrl(''), 'about:blank')
    assert.equal(normalizeUrl('   '), 'about:blank')
    assert.equal(normalizeUrl('about:blank'), 'about:blank')
})

test('危险协议不当作地址，降级为搜索', () => {
    for (const input of ['file:///C:/Windows/win.ini', 'javascript:alert(1)', 'data:text/html,<h1>x</h1>']) {
        const out = normalizeUrl(input)
        assert.ok(out.startsWith('https://www.bing.com/search?q='), `expected search for ${input}, got ${out}`)
    }
})

test('普通搜索词走 Bing', () => {
    const out = normalizeUrl('摸鱼 工作台')
    assert.ok(out.startsWith('https://www.bing.com/search?q='))
    assert.ok(out.includes(encodeURIComponent('摸鱼 工作台')))
})

test('非法 http 地址不会原样返回', () => {
    assert.ok(normalizeUrl('http://').startsWith('https://www.bing.com/search?q='))
})
