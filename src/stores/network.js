import { action, computed, extendObservable } from 'mobx'
import { getHost, shortUid } from '../utilities/common.js'
import fetch from 'isomorphic-unfetch'

class Network {
  /**
   * @constructor
   * @param {array} peers - Peers discovered by the network crawler.
   * @prop {number} lastUpdate - Last time the peers were updated.
   * @prop {number} perPage - Table rows per page.
   */
  constructor(peers) {
    this.lastUpdate = 0
    this.perPage = 20

    /** Extend the store with observable properties. */
    extendObservable(this, { page: 1, peers: [] })

    /** Set peers. */
    this.setPeers(peers.peers)
  }

  /**
   * Get network statistics.
   * @function stats
   * @return {object} Network statistics.
   */
  @computed
  get stats() {
    return this.peers.reduce(
      (stats, peer, index) => {
        if (peer.tcp_open === true) {
          /** Increment the sum of block heights and public peer count. */
          stats.avgBlockHeight += peer.height
          stats.public += 1

          /** Update maximum block height. */
          if (peer.height > stats.maxBlockHeight) {
            stats.maxBlockHeight = peer.height
          }

          /** Update OS count. */
          const peerOS = peer.useragent.split('; ')[1].split(')/')[0]

          if (stats.os.hasOwnProperty(peerOS) === true) {
            stats.os[peerOS] += 1
          } else {
            stats.os[peerOS] = 1
          }

          /** Update version count. */
          if (stats.versions.hasOwnProperty(peer.version) === true) {
            stats.versions[peer.version] += 1
          } else {
            stats.versions[peer.version] = 1
          }
        } else {
          /** Update firewalled peer count. */
          stats.firewalled += 1
        }

        /** Increment the sum of round trip times. */
        stats.avgRTT += peer.rtt

        /** Update super and normal peer counts. */
        if (peer.super_peer === true) {
          stats.superPeers += 1
        } else {
          stats.peers += 1
        }

        /** Calculate averages and network health on the last iteration. */
        if (index + 1 === this.peers.length) {
          stats.avgBlockHeight /= stats.public
          stats.avgRTT /= stats.public
          stats.health = stats.avgBlockHeight / stats.maxBlockHeight * 100
        }

        return stats
      },
      {
        avgBlockHeight: 0,
        avgRTT: 0,
        firewalled: 0,
        health: 0,
        maxBlockHeight: 0,
        os: {},
        peers: 0,
        public: 0,
        superPeers: 0,
        versions: {}
      }
    )
  }

  /**
   * Set current page.
   * @function setPage
   * @param {number} page - Current page.
   */
  @action
  setPage(page) {
    this.page = page
  }

  /**
   * Set core network peers.
   * @function setPeers
   * @param {array} peers - Core network peers.
   */
  @action
  setPeers(peers) {
    /** Set last update time in ms. */
    this.lastUpdate = Date.now()

    /** Convert string values to int or boolean, and add a unique key. */
    this.peers = peers.reduce((peers, peer) => {
      let endpoint = peer.endpoint.split(':')

      peers.push({
        endpoint: ''.concat(endpoint[0].split('.')[0], '.*.*.*:', endpoint[1]),
        version: peer.version,
        protocol: parseInt(peer.protocol),
        useragent: peer.useragent,
        height: parseInt(peer.height),
        uptime: parseInt(peer.uptime),
        last_update: parseInt(peer.last_update),
        last_probed: parseInt(peer.last_probed),
        rtt: parseInt(peer.rtt),
        udp_bps_inbound: parseInt(peer.udp_bps_inbound),
        udp_bps_outbound: parseInt(peer.udp_bps_outbound),
        tcp_open: peer.tcp_open === 'true',
        super_peer: peer.super_peer === 'true',
        key: shortUid()
      })

      return peers
    }, [])
  }

  /**
   * Update network peers info.
   * @function getPeers
   * @param {boolean} isServer - Calling from server or client.
   */
  async getPeers(isServer) {
    let peers = await fetch(''.concat(getHost(isServer), '/api/peers'))
    peers = await peers.json()

    /** Set peers and a new timeout for 1min. */
    this.setPeers(peers.peers)
    this.updateTimeout = setTimeout(() => this.getPeers(isServer), 60 * 1000)
  }

  /**
   * Start or stop the peers auto-update loop.
   * @function update
   * @param {boolean} start - Start or stop the update loop.
   * @param {boolean} isServer - Calling from server or client.
   */
  update(start, isServer) {
    if (start === false) return clearTimeout(this.updateTimeout)

    /** Update peers if they're older than 30s (switching between pages.) */
    const diff = Date.now() - this.lastUpdate
    const updateIn = diff > 30 * 1000 ? 1 : diff

    this.updateTimeout = setTimeout(() => this.getPeers(isServer), updateIn)
  }
}

/**
 * Initialize a new store or return an existing one.
 * @function initNetwork
 * @param {boolean} isServer - Calling from server or client.
 * @param {array} peers - Peers discovered by the network crawler.
 */
export const initNetwork = (isServer, peers) => {
  if (isServer && typeof window === 'undefined') {
    return new Network(peers)
  } else {
    if (networkStore === null) {
      networkStore = new Network(peers)
    }

    return networkStore
  }
}

/** Keep a global reference of the network store. */
let networkStore = null
