import { EntrarForm } from "./entrar-form";

// The sign-in content, shared by the /entrar page and the floating modal opened from any page
export function EntrarCard({ next, heading: H = "h1", id }: { next: string; heading?: "h1" | "h2"; id?: string }) {
  return (
    <>
      <H id={id}>Entra en CuponLab</H>
      <p className="lead">No hace falta contraseña. Te mandamos un enlace al email.</p>
      <EntrarForm next={next} />
      <p className="small">
        Al entrar puedes votar, comentar, guardar chollos y compartir los tuyos. Con tu cuenta eliges un nombre público como <span className="mono">@tu_nombre</span>.
      </p>
    </>
  );
}
