import { Component } from "solid-js";

const NotFound: Component = () => {
  return (
    <div class="min-h-screen w-full flex flex-col items-center justify-center font-sans antialiased selection:bg-white selection:text-brand relative">
      <div class="text-center px-6 max-w-2xl mx-auto z-10">
        <h1 class="text-[10rem] md:text-[14rem] font-medium leading-none tracking-tighter text-secondary select-none">
          404
        </h1>

        <h2 class="text-2xl md:text-3xl font-medium text-secondary mt-4 mb-4">
          It looks like you’re lost.
        </h2>

        <p class="text-secondary/60 text-lg md:text-xl leading-relaxed max-w-md mx-auto mb-10">
          The page you are looking for is not available. It might have been
          moved or deleted.
        </p>

        <div class="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <a
            href="/"
            class="px-8 py-3.5 rounded-full bg-secondary text-brand font-semibold text-sm hover:bg-secondary/90 transition-colors duration-200 ease-in-out"
          >
            Back to Home
          </a>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
