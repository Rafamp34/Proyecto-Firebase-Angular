import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, catchError, forkJoin, map, Observable, of, Subject } from 'rxjs';
import { Playlist } from 'src/app/core/models/playlist.model';
import { User } from 'src/app/core/models/user.model';
import { Song } from 'src/app/core/models/song.model';
import { BaseAuthenticationService } from 'src/app/core/services/impl/base-authentication.service';
import { PlaylistsService } from 'src/app/core/services/impl/playlists.service';
import { SongsService } from 'src/app/core/services/impl/songs.service';
import { filter, switchMap, take, takeUntil } from 'rxjs/operators';
import { LanguageService } from '../../core/services/language.service';
import { UserService } from 'src/app/core/services/impl/user.service';
import { ArtistsService } from 'src/app/core/services/impl/artists.service';
import { ICollectionSubscription } from 'src/app/core/services/interfaces/collection-subscription.interface';
import { COLLECTION_SUBSCRIPTION_TOKEN } from 'src/app/core/repositories/repository.tokens';
import { CollectionChange } from 'src/app/core/services/interfaces/collection-subscription.interface';

interface SongWithArtists extends Song {
  artistNames?: string[];
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy {
  isMobile: boolean = false;
  showSearch: boolean = false;
  currentLang: string;
  selectedTab: 'all' | 'music' | 'podcasts' = 'all';
  searchQuery: string = '';

  private _quickAccess = new BehaviorSubject<Playlist[]>([]);
  quickAccess$ = this._quickAccess.asObservable();

  private _newReleases = new BehaviorSubject<SongWithArtists[]>([]);
  newReleases$ = this._newReleases.asObservable();

  private _recommendedSongs = new BehaviorSubject<SongWithArtists[]>([]);
  recommendedSongs$ = this._recommendedSongs.asObservable();

  private _currentUser = new BehaviorSubject<User | null>(null);
  currentUser$ = this._currentUser.asObservable();

  // Subjects for subscriptions and cleanup
  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    public authSvc: BaseAuthenticationService,
    private playlistsSvc: PlaylistsService,
    private songsSvc: SongsService,
    private artistsSvc: ArtistsService,
    private languageService: LanguageService,
    private userService: UserService,
    @Inject(COLLECTION_SUBSCRIPTION_TOKEN) 
    private collectionSubscriptionSvc: ICollectionSubscription<Playlist> & ICollectionSubscription<Song>
  ) {
    this.currentLang = this.languageService.getStoredLanguage();
  }

  ngOnInit() {
    this.checkIfMobile();
    window.addEventListener('resize', this.checkIfMobile.bind(this));
  
    // User data and authentication handling
    this.authSvc.user$.pipe(
      filter(user => user !== undefined),
      switchMap(user => {
        if (!user) return of(null);
        return this.userService.getById(user.id);
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (userData) => {
        if (userData) {
          const updatedUser: User = {
            ...userData,
            displayName: userData.displayName || `${userData.name} ${userData.surname}`,
            image: userData.image || undefined
          };
          this._currentUser.next(updatedUser);
        }
      },
      error: (error) => {
        console.error('Error loading user data:', error);
      }
    });
  
    // Authentication and content loading
    this.authSvc.ready$.pipe(
      filter(ready => ready),
      switchMap(() => this.authSvc.authenticated$),
      take(1),
      takeUntil(this.destroy$)
    ).subscribe(isAuthenticated => {
      if (!isAuthenticated) {
        this.router.navigate(['/login']);
        return;
      }
  
      this.loadUserContent();
      this.setupCollectionSubscriptions();
    });
  }

  ngOnDestroy() {
    // Unsubscribe from Firebase collections
    this.collectionSubscriptionSvc.unsubscribe('playlists');
    this.collectionSubscriptionSvc.unsubscribe('songs');
    
    // Complete the destroy subject to stop all ongoing subscriptions
    this.destroy$.next();
    this.destroy$.complete();
    
    // Remove event listener
    window.removeEventListener('resize', this.checkIfMobile.bind(this));
  }

  // Event Handlers
  onSearchChange(event: CustomEvent) {
    this.searchQuery = event.detail.value;
  }

  toggleSearch() {
    this.showSearch = !this.showSearch;
  }

  changeLanguage(lang: string) {
    this.languageService.changeLanguage(lang);
    this.currentLang = lang;
    this.languageService.storeLanguage(lang);
  }

  selectTab(tab: 'all' | 'music' | 'podcasts') {
    this.selectedTab = tab;
  }

  openPlaylist(playlist: Playlist) {
    this.router.navigate(['/playlist', playlist.id]);
  }

  openSong(song: Song) {
    console.log('Playing song:', song);
    // TODO: Implement song playback logic
  }

  showAllSongs() {
    this.router.navigate(['/songs']);
  }

  showAllRecommended() {
    this.router.navigate(['/recommended']);
  }

  checkIfMobile() {
    this.isMobile = window.innerWidth <= 768;
    console.log('Is Mobile:', this.isMobile);
  }

  // Collection Subscription Setup
  // Collection Subscription Setup
  private setupCollectionSubscriptions() {
    // Subscribe to playlists collection changes
    this.collectionSubscriptionSvc
      .subscribe('playlists')
      .pipe(takeUntil(this.destroy$))
      .subscribe(change => {
        const currentPlaylists = this._quickAccess.value;
        
        switch (change.type) {
          case 'added':
            if (change.data && !currentPlaylists.some(p => p.id === change.id)) {
              this._quickAccess.next([...currentPlaylists, change.data as Playlist]);
            }
            break;
          case 'modified':
            if (change.data) {
              const index = currentPlaylists.findIndex(p => p.id === change.id);
              if (index !== -1) {
                const updatedPlaylists = [...currentPlaylists];
                updatedPlaylists[index] = change.data as Playlist;
                this._quickAccess.next(updatedPlaylists);
              }
            }
            break;
          case 'removed':
            this._quickAccess.next(currentPlaylists.filter(p => p.id !== change.id));
            break;
        }
      });

    // Subscribe to songs collection changes
    this.collectionSubscriptionSvc
      .subscribe('songs')
      .pipe(
        switchMap(async (change: any) => {
          // Type guard to ensure we're dealing with a Song
          if (change.type !== 'removed' && change.data && this.isSong(change.data)) {
            const songsWithArtists = await this.enrichSongWithArtists([change.data]);
            return { ...change, data: songsWithArtists[0] };
          }
          return change;
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(change => {
        const currentNewReleases = this._newReleases.value;
        const currentRecommendedSongs = this._recommendedSongs.value;
        
        // Additional type check
        if (change.type !== 'removed' && change.data && this.isSong(change.data)) {
          const songData = change.data as SongWithArtists;
          
          switch (change.type) {
            case 'added':
              if (!currentNewReleases.some(s => s.id === songData.id)) {
                this._newReleases.next([...currentNewReleases, songData]);
                this._recommendedSongs.next([...currentRecommendedSongs, songData]);
              }
              break;
            case 'modified':
              // Update in new releases
              const newReleasesIndex = currentNewReleases.findIndex(s => s.id === songData.id);
              if (newReleasesIndex !== -1) {
                const updatedNewReleases = [...currentNewReleases];
                updatedNewReleases[newReleasesIndex] = songData;
                this._newReleases.next(updatedNewReleases);
              }

              // Update in recommended songs
              const recommendedIndex = currentRecommendedSongs.findIndex(s => s.id === songData.id);
              if (recommendedIndex !== -1) {
                const updatedRecommendedSongs = [...currentRecommendedSongs];
                updatedRecommendedSongs[recommendedIndex] = songData;
                this._recommendedSongs.next(updatedRecommendedSongs);
              }
              break;
          }
        }
      });
  }
  
  // Content Loading Methods
  private loadUserContent() {
    this.authSvc.user$.pipe(
      filter(user => user !== undefined),
      take(1),
      switchMap(user => {
        if (!user) {
          throw new Error('No user found');
        }
  
        const allSongs$ = this.songsSvc.getAll(1, 1000, { sort: 'createdAt:desc' }).pipe(
          map(response => 'data' in response ? response.data : response),
          switchMap(async songs => this.enrichSongWithArtists(songs)),
          catchError(err => {
            console.error('Error loading songs:', err);
            return of([]);
          })
        );
  
        return forkJoin({
          playlists: this.playlistsSvc.getAll(1, 9, { sort: 'createdAt:desc' }).pipe(
            map(response => 'data' in response ? response.data : response),
            catchError(err => {
              console.error('Error loading playlists:', err);
              return of([]);
            })
          ),
          allSongs: allSongs$
        });
      }),
      map(({ playlists, allSongs }) => {
        const songs = allSongs.slice(0, 8); 
        const recommendedSongs = allSongs.slice(-8); 
  
        return {
          playlists,
          songs,
          recommendedSongs
        };
      })
    ).subscribe({
      next: ({ playlists, songs, recommendedSongs }) => {
        this._quickAccess.next(playlists);
        this._newReleases.next(songs);
        this._recommendedSongs.next(recommendedSongs);
      },
      error: (error) => {
        console.error('Error loading content:', error);
      }
    });
  }

  // Type guard to check if an object is a Song
  private isSong(data: any): data is Song {
    return data 
      && typeof data === 'object' 
      && 'artists_IDS' in data 
      && 'name' in data 
      && 'duration' in data;
  }

  // Enrich Songs with Artist Names
  private async enrichSongWithArtists(songs: Song[]): Promise<SongWithArtists[]> {
    const enrichedSongs: SongWithArtists[] = [];
    
    for (const song of songs) {
      if (song.artists_IDS && song.artists_IDS.length > 0) {
        try {
          const artists = await this.artistsSvc.getByIds(song.artists_IDS).toPromise();
          if (artists) {
            const enrichedSong: SongWithArtists = {
              ...song,
              artistNames: artists.map(artist => artist.name)
            };
            enrichedSongs.push(enrichedSong);
          }
        } catch (error) {
          console.error('Error loading artists for song:', song.id, error);
          enrichedSongs.push({ ...song, artistNames: [] });
        }
      } else {
        enrichedSongs.push({ ...song, artistNames: [] });
      }
    }
    
    return enrichedSongs;
  }
}