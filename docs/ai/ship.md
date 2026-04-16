# ComicPedia Ship Checklist

## 适用范围

ComicPedia 当前采用轻量发版流程：

- 以 `package.json` 的版本号为准
- 不强依赖独立的 `VERSION`、`CHANGELOG.md`、`TODOS.md` 发版闸门
- 本地和 CI 统一使用 `lint -> test -> build` 作为最小发布基线

## 本地发版前检查

```bash
pnpm ship:check
```

`pnpm ship:check` 会：

1. 检测当前分支，阻止直接在默认基线分支上发版
2. 输出当前工作区状态
3. 顺序执行：
   - `pnpm lint`
   - `pnpm test`
   - `pnpm build`
4. 给出 push / PR 的下一步提示

## 推荐流程

1. 在功能分支或 `dev` 上完成开发
2. 运行 `pnpm ship:check`
3. push 当前分支
4. 创建指向默认基线分支的 PR
5. 合并前做最小人工冒烟

默认情况下，本仓库当前远端默认基线分支是 `master`。

## 最小人工冒烟

以下页面建议在合并前至少过一遍：

- `/create`
- `/history`
- `/result/[id]`
- `/settings`

如果改动涉及以下能力，还应额外跑一条真实链路：

- prompt 模板
- 角色一致性
- review loop / retry loop
- 图片生成或导出

## CI 约定

GitHub Actions 工作流位于 `.github/workflows/ci.yml`，会在 push 和 pull request 时执行：

```bash
pnpm lint
pnpm test
pnpm build
```

这三项通过后，才视为具备最基本的可合并条件。
