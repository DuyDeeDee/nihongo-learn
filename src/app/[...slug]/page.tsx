import {GenericPage} from "@/components/generic-page";
export default async function CatchAllPage({params}:{params:Promise<{slug:string[]}>}){const {slug}=await params;return <GenericPage slug={slug}/>}
