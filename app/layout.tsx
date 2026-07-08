import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alpaca Margin & Risk Terminal",
  description: "Real-time margin risk analyzer and simulated broker terminal with live Alpaca API integration.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var namespaces = ['wx', 'my', 'swan', 'tt', 'qq', 'ks', 'qh'];
                  namespaces.forEach(function(ns) {
                    if (typeof window !== 'undefined') {
                      if (!window[ns]) {
                        try {
                          window[ns] = { miniProgram: {} };
                        } catch (e) {}
                      } else if (typeof window[ns] === 'object' && window[ns] !== null) {
                        try {
                          if (!window[ns].miniProgram) {
                            window[ns].miniProgram = {};
                          }
                        } catch (e) {}
                      }
                    }
                  });
                } catch (e) {}
              })();
            `
          }}
        />
      </head>
      <body className="font-sans antialiased bg-brand-bg text-brand-text min-h-screen">
        {children}
      </body>
    </html>
  );
}
