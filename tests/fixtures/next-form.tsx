import type { FormHTMLAttributes } from "react";

// Isolated visual fixtures use native GET navigation; production uses Next Form.
export default function Form(props: FormHTMLAttributes<HTMLFormElement>) {
  return <form {...props} method="get" />;
}
