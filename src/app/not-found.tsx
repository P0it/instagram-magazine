export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <div className="text-6xl font-black tracking-tight">404</div>
        <p className="mt-2 text-sm text-muted-foreground">This page could not be found.</p>
      </div>
    </div>
  );
}
