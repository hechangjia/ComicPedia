import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
const state=vi.hoisted(()=>({replace:vi.fn()}));
vi.mock("react",async original=>({...await original<typeof import('react')>(),useState:(value:unknown)=>[value,vi.fn()],useEffect:()=>{},useCallback:(fn:unknown)=>fn}));
vi.mock("next/navigation",()=>({useSearchParams:()=>new URLSearchParams('mode=science&series=series-a'),useRouter:()=>({replace:state.replace})}));
vi.mock("next/dynamic",()=>({default:()=>()=>null}));
vi.mock("@/hooks/useAPIConfig",()=>({useConfigCheck:()=>({hasLLM:true,hasImage:true,isLoaded:true})}));
vi.mock("@/components/ScienceForm",()=>({ScienceForm:()=>null}));
vi.mock("@/components/OnboardingGuide",()=>({OnboardingGuide:()=>null}));
vi.mock("@/components/TemplatePanel",()=>({TemplatePanel:()=>null}));
vi.mock("@/components/InspirationSquare",()=>({InspirationSquare:()=>null}));
vi.mock("@/lib/client/db",()=>({getSeries:vi.fn()}));
import { FormLayout } from "@/components/FormLayout";
function buttons(node:any):any[]{if(!node||typeof node!=='object')return [];const children=React.Children.toArray(node.props?.children);return [...(node.type==='button'?[node]:[]),...children.flatMap(buttons)];}
describe('creation navigation',()=>{
 it('switches URL mode while preserving series context',()=>{
  const tree=FormLayout({});const poetry=buttons(tree).find(button=>renderToStaticMarkup(button).includes('诗词漫画'));
  poetry.props.onClick();expect(state.replace).toHaveBeenCalledWith('/create?mode=poetry&series=series-a',{scroll:false});
 });
});
