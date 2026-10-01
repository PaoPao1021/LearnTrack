import { useSearchParams } from 'react-router-dom';
import { AgentPanel } from './AgentPanel';
export default function Assistant() {
  const [params] = useSearchParams();
  const task = params.get('task');
  return <div className="space-y-6"><header className="page-heading"><div><h1>学习助手</h1><p>起草安排、讨论难点，把值得保留的总结用于下一次学习。</p></div></header><AgentPanel library initialTask={task === 'plan' || task === 'guide' ? task : 'review'}/></div>;
}
