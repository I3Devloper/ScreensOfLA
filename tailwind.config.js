/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/**/*.{js,jsx,ts,tsx}',
        './src/styles/**/*.{css,scss}',
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#f0f9ff',
                    100: '#e0f2fe',
                    200: '#bae6fd',
                    300: '#7dd3fc',
                    400: '#38bdf8',
                    500: '#0ea5e9',
                    600: '#0284c7',
                    700: '#0369a1',
                    800: '#075985',
                    900: '#0c4a6e',
                },
            },
            boxShadow: {
                'bento': '0 4px 20px rgba(0, 0, 0, 0.08)',
                'bento-hover': '0 8px 30px rgba(0, 0, 0, 0.12)',
            },
        },
    },
    plugins: [],
};
