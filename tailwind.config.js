/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            boxShadow: {
                'stone-raised': '-6px -6px 12px #2A2D2F, 6px 6px 12px #0F1011',
                'stone-pressed': 'inset 6px 6px 12px #0F1011, inset -6px -6px 12px #2A2D2F',
            },
        },
    },
    plugins: [],
}
