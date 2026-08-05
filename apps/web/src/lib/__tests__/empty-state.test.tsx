import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EmptyState from "@/components/ui/EmptyState";
import { HiOutlineSearch } from "react-icons/hi";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(<EmptyState icon={HiOutlineSearch} title="Nothing here" description="Try again" />);
    expect(screen.getByText("Nothing here")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });
});
