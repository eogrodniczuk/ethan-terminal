export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section-wrap">
      <div className="bbg-section-title">{title}</div>
      <div className="section-body">{children}</div>
    </section>
  );
}