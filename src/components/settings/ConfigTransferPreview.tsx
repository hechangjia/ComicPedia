import type { MergeResult, ParsedConfigArchive, TransferCounts } from "@/lib/config/configTransfer";
const roles: Array<[keyof TransferCounts, string]> = [["llm", "文字脚本"], ["vlm", "视觉复审"], ["image", "文生图"], ["accuracy", "检索服务"]];
export function ConfigTransferPreview({ parsed, plan, includeCredentials, onCredentialsChange, includeWorkflows = false, onWorkflowsChange }: {
  parsed: ParsedConfigArchive; plan: MergeResult; includeCredentials: boolean; onCredentialsChange: (value: boolean) => void; includeWorkflows?: boolean; onWorkflowsChange?: (value: boolean) => void;
}) {
  return <div className="space-y-4 text-sm">
    <p className="text-muted-foreground">只新增配置，不覆盖现有条目或密钥。现有默认模型与检索角色保持不变；未分配的角色可采用文件中的选择。</p>
    <table className="w-full text-left tabular-nums">
      <caption className="sr-only">配置合并预览</caption>
      <thead><tr className="border-b"><th scope="col" className="py-2">用途</th><th scope="col">新增</th><th scope="col">跳过重复</th></tr></thead>
      <tbody>{roles.map(([key, label]) => <tr key={key} className="border-b"><th scope="row" className="py-3 font-normal">{label}</th><td>{plan.added[key]}</td><td>{plan.skipped[key]}</td></tr>)}</tbody>
    </table>
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer font-medium">检查导入的模型与服务地址</summary>
      <ul className="mt-3 space-y-3 break-words">
        {[...parsed.config.llmConfigs, ...(parsed.config.vlmConfigs ?? []), ...parsed.config.imageConfigs].map((m, index) => <li key={`model-${index}`}><span className="font-medium">{m.name}</span><span className="block text-muted-foreground">{m.model} · {m.apiUrl}</span></li>)}
        {parsed.config.accuracyConfig.providers.map(p => <li key={`provider-${p.id}`}><span className="font-medium">{p.name}</span><span className="block text-muted-foreground">{p.kind} · {p.baseUrl}</span></li>)}
      </ul>
    </details>
    <p>白名单合并为 {plan.config.accuracyConfig.whitelistDomains.length} 个域名；导入配置不代表模型能力已验证。</p>
    {parsed.credentialCount > 0 ? <label className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
      <input type="checkbox" checked={includeCredentials} onChange={e => onCredentialsChange(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />
      <span>允许导入文件中的 {parsed.credentialCount} 项 API 密钥<span className="block mt-1 text-muted-foreground">默认不导入。仅对新增配置生效；不要导入不可信来源的密钥。</span></span>
    </label> : <p className="rounded-lg border p-3 text-muted-foreground">文件不含 API 密钥。需要鉴权的服务，请导入后重新填写密钥。</p>}
        {(parsed.omittedWorkflows ?? 0) > 0 && <p className="rounded-lg border p-3">原导出文件已省略 {parsed.omittedWorkflows} 个工作流；相应 ComfyUI 配置需补充工作流后才能生成。</p>}
    {parsed.workflowCount > 0 && <label className="flex items-start gap-3 rounded-lg border border-warning/40 p-3"><input type="checkbox" checked={includeWorkflows} onChange={e => onWorkflowsChange?.(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" /><span>允许导入 {parsed.workflowCount} 个自定义工作流<span className="mt-1 block text-muted-foreground">默认排除，可能含内嵌令牌或私人内容。导入只保存、不执行；运行前请检查节点。</span></span></label>}
  </div>;
}
