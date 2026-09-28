import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "./SignInForm";
export const metadata: Metadata = { title: "Sign in" };
export default function SignIn() { return <Suspense><SignInForm /></Suspense>; }
