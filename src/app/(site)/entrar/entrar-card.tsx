import { EntrarFlow } from "./entrar-flow";

// The sign-in content, shared by the /entrar page and the floating modal opened from any page
export function EntrarCard({ next, heading = "h1", id = "entrar-h" }: { next: string; heading?: "h1" | "h2"; id?: string }) {
  return <EntrarFlow next={next} heading={heading} id={id} />;
}
