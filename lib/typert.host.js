import { z } from 'zod'
import {
  PACKAGE_NAME,
  SERVICE_NAME,
  SERVICE_NAMESPACE,
} from './shared.js'

const argsCodec = {
  mode: 'strict',
  typeSymbol: `${PACKAGE_NAME}#Args`,
  schema: z.record(z.string(), z.unknown()),
}
const resultCodec = {
  mode: 'strict',
  typeSymbol: `${PACKAGE_NAME}#Result`,
  schema: z.record(z.string(), z.unknown()),
}

const invocation = (method) => ({
  id: `${PACKAGE_NAME}#${SERVICE_NAMESPACE}/${method}`,
  service: SERVICE_NAME,
  namespace: SERVICE_NAMESPACE,
  method,
  invocation: { kind: 'direct' },
  parameters: [
    { name: 'args', wire: 'args', source: 'json', codec: argsCodec },
  ],
  result: resultCodec,
})

const member = (name, signature, summary) => ({
  kind: 'method',
  name,
  signature,
  summary,
  jsDoc: `/** ${summary} */`,
})

export const TYPERT = {
  package: PACKAGE_NAME,
  face: 'host',
  schemas: [],
  invocations: [
    invocation('listProjects'),
    invocation('listChanges'),
    invocation('getChangeStatus'),
    invocation('listDocuments'),
    invocation('readDocument'),
    invocation('getEvidence'),
  ],
  model: {
    services: [{
      description: 'OpenSpec Workbench 的只读 Workspace-scoped 查询服务。',
      summary: 'OpenSpec Workbench 只读查询服务',
      tags: ['openspec', 'workbench', 'read-only'],
      jsDoc: '/** OpenSpec Workbench 只读查询服务。 */',
      key: SERVICE_NAME,
      exportName: 'OpenSpecWorkbenchService',
      members: [
        member('listProjects', 'listProjects(args: object): Promise<object>', '列出已注册 Workspace 中可发现的 OpenSpec 项目。'),
        member('listChanges', 'listChanges(args: object): Promise<object>', '列出一个 Workspace 的 OpenSpec changes 及其摘要。'),
        member('getChangeStatus', 'getChangeStatus(args: object): Promise<object>', '读取一个 change 的权威状态与工件依赖证据。'),
        member('listDocuments', 'listDocuments(args: object): Promise<object>', '列出一个 change 的可读文档。'),
        member('readDocument', 'readDocument(args: object): Promise<object>', '按需读取一个有大小边界的 OpenSpec 文档。'),
        member('getEvidence', 'getEvidence(args: object): Promise<object>', '按需读取 status、validation、diff 或 instructions 证据。'),
      ],
      types: [],
    }],
    events: [],
    objects: [],
  },
}

export default TYPERT
