import { useContent } from '../context/ContentContext';
import { SITE } from '../config/site';
import { ContentBlock } from '../components/ui';

export default function About() {
  const { content } = useContent();
  return (
    <div className="page mt-10 max-w-3xl">
      <h1 className="text-3xl font-bold">About {SITE.shortName}</h1>
      <section className="mt-6" aria-labelledby="intro"><h2 id="intro" className="mb-2 text-xl font-bold">Campus introduction</h2><ContentBlock value={content.about_intro} /></section>
      <section className="mt-8" aria-labelledby="hist"><h2 id="hist" className="mb-2 text-xl font-bold">History</h2><ContentBlock value={content.history} /></section>
      <section className="mt-8" aria-labelledby="vis"><h2 id="vis" className="mb-2 text-xl font-bold">Vision</h2><ContentBlock value={content.vision} /></section>
      <section className="mt-8" aria-labelledby="mis"><h2 id="mis" className="mb-2 text-xl font-bold">Mission</h2><ContentBlock value={content.mission} /></section>
    </div>
  );
}
