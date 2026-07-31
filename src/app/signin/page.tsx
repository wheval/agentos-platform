import { redirect } from "next/navigation";
import { operatorAuthConfigured, signInOperator } from "@/lib/operator-session";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!operatorAuthConfigured()) redirect("/console");

  const { error } = await searchParams;

  async function signIn(formData: FormData) {
    "use server";

    const token = String(formData.get("token") ?? "");
    const result = await signInOperator(token);

    if (!result.ok) redirect("/signin?error=1");

    redirect("/console");
  }

  return (
    <main className="dashboard-grid flex min-h-screen items-center justify-center px-5 py-16">
      <div className="card-shadow w-full max-w-sm rounded-2xl border border-[#dde2dc] bg-white p-6">
        <h1 className="text-lg font-semibold tracking-tight text-[#14231f]">
          Operator sign-in
        </h1>
        <p className="mt-1.5 text-sm text-[#66736e]">
          This deployment uses a single shared operator token. There are no
          per-person accounts yet, so approvals are attributed by selection
          rather than by identity.
        </p>

        <form action={signIn} className="mt-5">
          <label className="block text-sm">
            <span className="font-medium text-[#14231f]">Operator token</span>
            <input
              type="password"
              name="token"
              required
              autoComplete="current-password"
              aria-describedby={error ? "signin-error" : undefined}
              className="mt-1.5 w-full rounded-lg border border-[#c9d2ca] bg-white px-3 py-2 text-sm text-[#14231f] outline-none transition-colors focus:border-[#2f6b55]"
            />
          </label>

          {error ? (
            <p id="signin-error" role="alert" className="mt-2 text-sm text-[#8a2f28]">
              That token was not accepted.
            </p>
          ) : null}

          <button
            type="submit"
            className="mt-4 w-full rounded-lg bg-[#2f6b55] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#255a47]"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
