import { PublishPage } from "@/components/publish/publish-page";

export default async function Page({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  return <PublishPage postId={decodeURIComponent(postId)} />;
}
