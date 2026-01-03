import { loginWithGoogle } from "../services/auth";

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <button
        onClick={loginWithGoogle}
        className="px-6 py-3 rounded-xl bg-primary text-primary-foreground"
      >
        Sign in with Google
      </button>
    </div>
  );
}
