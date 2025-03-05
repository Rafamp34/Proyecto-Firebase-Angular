import { Inject, Injectable } from "@angular/core";
import { IUserMapping } from "../intefaces/user-mapping.interface";
import { User } from "../../models/user.model";
import { Paginated } from "../../models/paginated.model";
import { FirebaseUser } from "../../models/firebase/firebase-user.model";
import { FIREBASE_CONFIG_TOKEN } from "../../repositories/repository.tokens";
import { Firestore, getFirestore } from "firebase/firestore";
import { initializeApp } from "firebase/app";

@Injectable({
    providedIn: 'root'
})
export class UserMappingFirebaseService implements IUserMapping {
    private db: Firestore;

    constructor(@Inject(FIREBASE_CONFIG_TOKEN) protected firebaseConfig: any) {
        this.db = getFirestore(initializeApp(firebaseConfig));
    }

    getPaginated(page: number, pageSize: number, pages: number, data: FirebaseUser[]): Paginated<User> {
        return {
            page,
            pageSize,
            pages,
            data: data.map(item => this.getOne(item))
        };
    }

    getOne(data: FirebaseUser): User {
        return {
          id: data.id || '',
          username: data.email?.split('@')[0] || '',
          email: data.email || '',
          displayName: data.displayName || '',
          name: data.name || '', 
          surname: data.surname || '',
          image: this.mapImage(data.image),
          followers: data.followers || [],
          following: data.following || [],
          playlists_ids: data.playlists_ids || []
        };
    }

    private mapImage(imageData: any): User['image'] | undefined {
        // If imageData is a string (URL)
        if (typeof imageData === 'string') {
            return {
                url: imageData,
                large: imageData,
                medium: imageData,
                small: imageData,
                thumbnail: imageData
            };
        }
        
        // If imageData is an object with a url property
        if (imageData && typeof imageData === 'object' && imageData.url) {
            return {
                url: imageData.url,
                large: imageData.large || imageData.url,
                medium: imageData.medium || imageData.url,
                small: imageData.small || imageData.url,
                thumbnail: imageData.thumbnail || imageData.url
            };
        }
        
        // If imageData is not provided or invalid
        return undefined;
    }

    setAdd(data: User): any {
        return {
            email: data.email || '',
            displayName: data.displayName || '',
            name: data.name || '',
            surname: data.surname || '',
            image: data.image?.url || null,
            followers: data.followers || [],
            following: data.following || [],
            playlists_ids: data.playlists_ids || []
        };
    }

    setUpdate(data: Partial<User>): any {
        const result: any = {};
        
        // Only include fields that are provided in the update
        if (data.email !== undefined) result.email = data.email;
        if (data.displayName !== undefined) result.displayName = data.displayName;
        if (data.name !== undefined) result.name = data.name;
        if (data.surname !== undefined) result.surname = data.surname;
        
        // Handle image updates
        if (data.image !== undefined) {
            // Store just the URL string in Firestore
            result.image = data.image?.url || null;
        }
        
        if (data.followers !== undefined) result.followers = data.followers;
        if (data.following !== undefined) result.following = data.following;
        if (data.playlists_ids !== undefined) result.playlists_ids = data.playlists_ids;
        
        return result;
    }

    getAdded(data: FirebaseUser): User {
        return this.getOne(data);
    }

    getUpdated(data: FirebaseUser): User {
        return this.getOne(data);
    }

    getDeleted(data: FirebaseUser): User {
        return this.getOne(data);
    }
}