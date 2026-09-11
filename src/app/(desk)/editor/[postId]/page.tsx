import { Editor } from "@/components/editor/editor";

export default async function EditorPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  return <Editor postId={decodeURIComponent(postId)} />;
}
