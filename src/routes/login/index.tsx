import { A, useNavigate } from '@solidjs/router';
import { createSignal } from 'solid-js';
import { authClient } from '~/lib/auth-client';

export default function LoginPage() {
    const [pending, setPending] = createSignal(false);
    const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

    const onSubmit = async (e: SubmitEvent) => {
        e.preventDefault();
        setPending(true);
        setErrorMessage(null);
        const form = e.currentTarget as HTMLFormElement;
        const fd = new FormData(form);

        const email = String(fd.get('email') ?? '').trim();
        const password = String(fd.get('password') ?? '');

        try {
            await authClient.signIn.email({
                email,
                password,
                callbackURL: '/asd',
            });
        } catch (error) {
            setErrorMessage('Invalid email or password');
            console.error('Login error:', error);
        } finally {
            setPending(false);
        }
    };

    return (
        <div class="w-full flex items-center justify-center min-h-[calc(100vh-4rem)] p-6">
            <div class="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl shadow-black/5">
                <div class="mb-8">
                    <h1 class="text-2xl font-semibold text-black">Login</h1>
                    <p class="text-sm text-zinc-600 mt-1">Enter your details to continue.</p>
                </div>

                <form class="space-y-4" onSubmit={onSubmit} novalidate>
                    {errorMessage() ? (
                        <div class="rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {errorMessage()}
                        </div>
                    ) : null}
                    <div class="group relative rounded-xl border border-zinc-200 bg-white focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 transition-all">
                        <label class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            Email
                        </label>
                        <input
                            type="email"
                            name="email"
                            placeholder="you@company.com"
                            class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none placeholder:text-zinc-400"
                        />
                    </div>

                    <div class="group relative rounded-xl border border-zinc-200 bg-white focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10 transition-all">
                        <label class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            Password
                        </label>
                        <input
                            type="password"
                            name="password"
                            placeholder="••••••••"
                            class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none placeholder:text-zinc-400"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={pending()}
                        class="w-full bg-secondary text-brand py-3 rounded-xl text-sm font-semibold hover:bg-black/90 transition-colors disabled:opacity-50"
                    >
                        {pending() ? 'Signing In...' : 'Sign In'}
                    </button>
                </form>

                <p class="mt-6 text-center text-sm text-zinc-600">
                    Don&apos;t have an account?{' '}
                    <A href="/signup" class="text-black font-semibold hover:underline">
                        Sign up
                    </A>
                </p>
            </div>
        </div>
    );
}
