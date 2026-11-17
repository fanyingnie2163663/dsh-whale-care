// node:test 共用的断言计数器：每条断言失败都带序号；文件末尾用 total() 锁住条数。
export function makeChecker() {
  let n = 0
  return {
    ok(cond, msg) {
      n += 1
      if (!cond) throw new Error('#' + n + ' ' + msg)
    },
    total: () => n,
  }
}
