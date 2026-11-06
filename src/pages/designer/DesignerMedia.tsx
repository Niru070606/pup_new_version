import { PageHeader } from '../../components/ui';
import MediaLibraryPanel from '../../components/media/MediaLibraryPanel';

export default function DesignerMedia() {
  return (
    <>
      <PageHeader title="Media library" intro="Logos, favicons, banners, backgrounds and carousel images. Images are only shown publicly after an administrator approves a design that uses them." />
      <MediaLibraryPanel purposes={['design']} canUpload={['design']} />
    </>
  );
}
