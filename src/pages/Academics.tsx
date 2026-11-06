import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';
import { unwrap } from '../lib/util';
import type { AcademicProgram } from '../lib/types';
import { EmptyState, ErrorNotice, Loading } from '../components/ui';

export default function Academics() {
  const q = useQuery(
    async () => unwrap<AcademicProgram[]>(await supabase.from('academic_programs').select('*').eq('is_published', true).order('display_order').order('name')),
    [],
  );
  return (
    <div className="page mt-10">
      <h1 className="text-3xl font-bold">Academic programs</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">Programs listed here are entered and verified by campus administrators.</p>
      <div className="mt-6">
        {q.loading && <Loading />}
        {q.error && <ErrorNotice message="Programs could not be loaded." onRetry={q.reload} />}
        {q.data && q.data.length === 0 && <EmptyState title="Programs not yet listed">Verified academic programs will appear here once an administrator adds them.</EmptyState>}
        {q.data && q.data.length > 0 && (
          <ul className="grid gap-4 md:grid-cols-2">
            {q.data.map((p) => (
              <li key={p.id} className="card">
                <h2 className="text-lg font-bold">{p.name}</h2>
                {p.description && <p className="prose-plain mt-1 text-sm">{p.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
