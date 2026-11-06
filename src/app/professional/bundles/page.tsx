import Link from "next/link";
import {pageAccount} from "@/lib/page-access";
import {withIdentity} from "@/lib/db";
import {AccessMessage} from "@/components/access-message";
import {ProfessionalNavigation} from "@/components/professional-navigation";
import {bundleChoices} from "@/modules/bundles/repository";
import {ServiceProductLinkBuilder} from "@/components/service-product-link-builder";
export const dynamic="force-dynamic";
export const metadata={title:"Service and product selections · GLOHAUS PRO",robots:{index:false,follow:false}};
export default async function Page(){const access=await pageAccount("professional","/professional/bundles");if(!access.account)return <AccessMessage code={access.error}/>;const choices=await withIdentity(access.account.authId,db=>bundleChoices(db,access.account!.professionalId!));
 return <div className="pro-app"><ProfessionalNavigation active="more" displayName={access.account.displayName}/><main id="main" className="pro-main pro-management-page"><Link className="back-link" href="/professional/tools">← Business tools</Link><h1>Service and product selections</h1><p className="lead">Share a service and product together; customers book and buy separately.</p><p>Current catalogue prices apply, with no bundle discount or combined checkout. Booking, delivery, fees and refunds remain separate; choose suitable products and describe them accurately.</p>{choices?<ServiceProductLinkBuilder choices={choices}/>:<p>Publish your professional page and complete the existing verification and seller payment setup before creating selections. <Link href="/professional/setup">Review setup</Link> · <Link href="/professional/seller-hub">Seller Hub</Link></p>}<p>Use your own published services and in-stock products. Eligibility is checked when the link opens; withdrawn listings also leave the selection.</p></main></div>;
}
