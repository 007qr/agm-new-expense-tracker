import { A, action, redirect, useAction, useSubmission } from '@solidjs/router';
import { auth } from '~/lib/auth';
import { db } from '~/drizzle/client';
import { user } from '~/drizzle/schema';
import { eq } from 'drizzle-orm';

export const register = action(async (formData: FormData) => {
    'use server';

    const name = String(formData.get('name') ?? '').trim();
    const emailRaw = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    const email = emailRaw.toLowerCase();

    let fieldError = '';
    if (name.length < 2) fieldError = 'Name must be at least 2 characters.';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldError = 'Enter a valid email.';
    if (password.length < 6) fieldError = 'Password must be at least 6 characters.';

    if (fieldError.length) {
        return { ok: false as const, message: fieldError };
    }

    try {
        const newUserResponse = await auth.api.signUpEmail({
            body: { name, email, password },
        });

        // TEMPORARY: Assign 'admin' role for testing RBAC
        if (newUserResponse?.user?.id) {
            await db.update(user).set({ role: 'admin' }).where(eq(user.id, newUserResponse.user.id));
        } else {
            console.warn('Could not assign role to new user: user ID not found in signup response.');
        }

        return redirect('/dashboard');
    } catch (err: any) {
        const msg = typeof err?.message === 'string' ? err.message : 'Signup failed. Try again.';
        return { ok: false as const, message: msg };
    }
});

type AuthResult = { ok: boolean; message?: string };

export default function SignupPage() {
    const submitRegister = useAction(register);
    const submission = useSubmission(register);

    const pending = () => submission.pending;
    const result = () => submission.result as AuthResult;
    const errorMessage = () => (result()?.ok === false ? result()?.message : undefined);

    const onSubmit = async (e: SubmitEvent) => {
        e.preventDefault();
        const form = e.currentTarget as HTMLFormElement;
        const fd = new FormData(form);

        // Optional: client-side trim to reduce round trips, but still validate on server.
        fd.set('name', String(fd.get('name') ?? '').trim());
        fd.set('email', String(fd.get('email') ?? '').trim());

        await submitRegister(fd);
    };

    return (
        <div class="w-full flex items-center justify-center min-h-[calc(100vh-4rem)] p-6">
            <div class="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl shadow-black/5">
                <div class="mb-8">
                    <h1 class="text-2xl font-semibold text-black">Create Account</h1>
                    <p class="text-sm text-zinc-600 mt-1">Set up your account in a few steps.</p>
                </div>

                <form class="space-y-4" onSubmit={onSubmit} novalidate>
                    {errorMessage() ? (
                        <div class="rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {errorMessage()}
                        </div>
                    ) : null}

                    <div class="group relative rounded-xl border border-zinc-200 bg-white transition-all focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10">
                        <label class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            Name
                        </label>
                        <input
                            type="text"
                            name="name"
                            placeholder="Your name"
                            autocomplete="name"
                            class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none placeholder:text-zinc-400"
                        />
                    </div>

                    <div class="group relative rounded-xl border border-zinc-200 bg-white transition-all focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10">
                        <label class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            Email
                        </label>
                        <input
                            type="email"
                            name="email"
                            placeholder="you@company.com"
                            autocomplete="email"
                            class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none placeholder:text-zinc-400"
                        />
                    </div>

                    <div class="group relative rounded-xl border border-zinc-200 bg-white transition-all focus-within:border-black/40 focus-within:ring-1 focus-within:ring-black/10">
                        <label class="absolute top-2 left-3.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            Password
                        </label>
                        <input
                            type="password"
                            name="password"
                            placeholder="••••••••"
                            autocomplete="new-password"
                            class="w-full bg-transparent text-black text-sm px-3.5 pt-7 pb-2.5 outline-none placeholder:text-zinc-400"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={pending()}
                        class={[
                            'w-full py-3 rounded-xl text-sm font-semibold transition-colors',
                            pending()
                                ? 'bg-black/20 text-black/60 cursor-not-allowed'
                                : 'bg-secondary text-brand hover:bg-black/90',
                        ].join(' ')}
                    >
                        {pending() ? 'Creating...' : 'Create Account'}
                    </button>
                </form>

                <p class="mt-6 text-center text-sm text-zinc-600">
                    Already have an account?{' '}
                    <A href="/login" class="text-black font-semibold hover:underline">
                        Log in
                    </A>
                </p>
            </div>
        </div>
    );
}
