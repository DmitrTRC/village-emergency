export function IncidentDetail({ id }: { id: string }) {
  return (
    <section>
      <h1>Инцидент</h1>
      <p data-testid="incident-id">{id}</p>
    </section>
  );
}
