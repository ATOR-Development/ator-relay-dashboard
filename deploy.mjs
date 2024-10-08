import Irys from '@irys/sdk'
import { ANT, ArweaveSigner } from '@ar.io/sdk'
import { copyFileSync } from 'fs'

// ator-dashboard process id
// const processId = '9UpvN6H7sMo0vkuQeou3Ra0pZguWavtpt_8lfqPQlI8'

// anyone process id
// const processId = 'lZKDfIa5JiWQ8ojjXiRSey_81Bftbib4tLpIJh4UO0g'
const processId = 'Rglgc93lGIpqHIgNo9rS0gIkG2s7aodCSMoGysi3r6Y'

const DEPLOY_FOLDER = './.output/public'
const IRYS_NODE = 'https://node2.irys.xyz/'
const jwk = JSON.parse(
  Buffer.from(process.env.PERMAWEB_KEY || 'NO_KEY', 'base64').toString('utf-8')
)
const irys = new Irys({ url: IRYS_NODE, token: 'arweave', key: jwk })
const ant = ANT.init({
  processId,
  signer: new ArweaveSigner(jwk)
})

let undername = 'dev'
if (process.env.PHASE === 'stage') {
  undername = 'stage'
} else if (process.env.PHASE === 'live') {
  undername = '@'
}

async function deploy() {
  // Hack: copy index.html to a file named "*" so it gets added to manifest as
  //       a wildcard route
  copyFileSync(DEPLOY_FOLDER + '/index.html', DEPLOY_FOLDER + '/*')

  const buildArtifact = await irys.uploadFolder(DEPLOY_FOLDER, {
    indexFile: 'index.html'
  })

  if (!buildArtifact) {
    console.error('Irys result error', buildArtifact)

    return
  }

  console.log('Irys result id', buildArtifact.id)
  console.log('Updating ANT undername', undername)

  const { id: deployedTxId } = await ant.setRecord({
    undername,
    transactionId: buildArtifact.id,
    ttlSeconds: 3600
  })

  console.log(
    'Deployed!  Please wait 20 - 30 minutes for ARNS to update!',
    deployedTxId
  )
}

deploy().then().catch(err => { console.error(err); process.exit(1); })
