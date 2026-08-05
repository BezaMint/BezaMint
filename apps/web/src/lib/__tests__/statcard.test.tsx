import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatCard from "@/components/ui/StatCard";
import { HiOutlinePhotograph } from "react-icons/hi";

describe("StatCard", () => {
  it("renders label and value", () => {
    render(<StatCard label="Total" value="42" icon={HiOutlinePhotograph} />);
    expect(screen.getByText("Total")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });
});
