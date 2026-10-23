import type {ButtonHTMLAttributes} from "react";import {cn} from "@/lib/utils";
type Props=ButtonHTMLAttributes<HTMLButtonElement>&{variant?:"default"|"secondary"|"outline"|"ghost"};
export function Button({variant="default",className,...props}:Props){const styles={default:"btn",secondary:"btn secondary",outline:"btn secondary",ghost:"btn secondary"};return <button className={cn(styles[variant],className)} {...props}/>}
