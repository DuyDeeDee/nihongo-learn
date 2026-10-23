import {GenericPage} from "@/components/generic-page";
export default async function CatchAllPage({params,searchParams}:{params:Promise<{slug:string[]}>;searchParams:Promise<{lesson?:string;demo?:string}>}){const {slug}=await params;const query=await searchParams;return <GenericPage slug={slug} studyLessonKey={query.lesson} studyDemo={query.demo==="1"}/>}
