"use client";

import Form from "next/form";
import type { ComponentProps } from "react";

// next/form, minus empty fields in the URL (?q=x, not ?q=x&cpv=&nuts=...). Disabled fields are
// left out of the form data; they're re-enabled once the navigation has read it. Without
// JavaScript the plain form still submits, empty fields and all.
export function SearchForm(props: ComponentProps<typeof Form>) {
  return (
    <Form
      {...props}
      onSubmit={(event) => {
        const empty = Array.from(event.currentTarget.elements).filter(
          (element): element is HTMLInputElement | HTMLSelectElement =>
            (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) &&
            element.name !== "" &&
            element.value === "",
        );
        empty.forEach((element) => (element.disabled = true));
        setTimeout(() => empty.forEach((element) => (element.disabled = false)));
      }}
    />
  );
}
