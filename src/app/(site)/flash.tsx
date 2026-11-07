import { cookies } from "next/headers";
import { decodeFlash, FLASH_COOKIE, flashMessage } from "@/lib/reader-entry";
import { FlashToast } from "./toast";

// Reads the sign-in flash set by confirmReaderLink / chooseHandle. Rendered inside <Suspense> (it reads cookies).
export async function Flash() {
  const flash = decodeFlash((await cookies()).get(FLASH_COOKIE)?.value);
  return flash ? <FlashToast message={flashMessage(flash)} /> : null;
}
