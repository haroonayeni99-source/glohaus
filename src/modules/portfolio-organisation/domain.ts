import { z } from 'zod';
const order = z.number().int().min(0).max(10000);
export const organisationAction = z.discriminatedUnion('action',[
 z.object({action:z.literal('saveCollection'),id:z.uuid().optional(),name:z.string().trim().min(1).max(80),publicationStatus:z.enum(['draft','published','hidden']),sortOrder:order}).strict(),
 z.object({action:z.literal('deleteCollection'),id:z.uuid()}).strict(),
 z.object({action:z.literal('saveUpload'),id:z.uuid(),featured:z.boolean(),sortOrder:order,collectionIds:z.array(z.uuid()).max(40).refine(v=>new Set(v).size===v.length)}).strict(),
 z.object({action:z.literal('saveSocialCollections'),id:z.uuid(),collectionIds:z.array(z.uuid()).max(40).refine(v=>new Set(v).size===v.length)}).strict(),
]);
export type OrganisationAction=z.infer<typeof organisationAction>;
export type WorkCollection={id:string;name:string;publication_status:string;sort_order:number};
export type WorkMembership={collection_id:string;asset_id:string|null;social_post_id:string|null};
export type WorkPresentation={asset_id:string;featured:boolean;sort_order:number};
export type PortfolioOrganisation={collections:WorkCollection[];memberships:WorkMembership[];presentation:WorkPresentation[]};
