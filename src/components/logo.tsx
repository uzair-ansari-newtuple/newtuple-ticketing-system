import Image from "next/image";

export function Logo({ className = "h-5" }: { className?: string }) {
  return (
    <>
      <Image src="/newtuple-logo.png" alt="Newtuple" width={1664} height={240} priority className={`${className} w-auto dark:hidden`} />
      <Image src="/newtuple-logo-white.png" alt="Newtuple" width={1664} height={240} priority className={`${className} hidden w-auto dark:block`} />
    </>
  );
}

export function LogoOnDark({ className = "h-6" }: { className?: string }) {
  return <Image src="/newtuple-logo-white.png" alt="Newtuple" width={1664} height={240} priority className={`${className} w-auto`} />;
}
