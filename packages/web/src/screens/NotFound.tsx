import { Link } from "../router/router";

export function NotFound() {
  return (
    <section>
      <h1>Не найдено</h1>
      <Link to="/">К ленте</Link>
    </section>
  );
}
