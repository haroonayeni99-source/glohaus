import React from 'react';
import {createRoot} from 'react-dom/client';
import {PortfolioOrganisation} from '@/components/portfolio-organisation';
document.documentElement.dataset.theme=new URLSearchParams(location.search).get('theme')||'light';
createRoot(document.getElementById('root')!).render(<main style={{padding:16,maxWidth:1000,margin:'0 auto'}}><PortfolioOrganisation initial={{collections:[],memberships:[],presentation:[]}} uploads={[{id:'22222222-2222-4222-8222-222222222222',caption:'Fictional uploaded braids',publication_status:'draft'}]} social={[{id:'33333333-3333-4333-8333-333333333333',caption:'Fictional linked video',publication_status:'published'}]}/></main>);
